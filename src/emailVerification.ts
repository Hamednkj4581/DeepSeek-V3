import { Page } from 'puppeteer';
import Utility from './Utility.js';

export interface EmailVerificationRequestOptions {
    attempts?: number;
    pollsPerAttempt?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
}

interface EmailVerificationState {
    sent: boolean;
    error?: string;
}

type VerificationButtonState = 'clicked' | 'disabled' | 'missing';

export async function fillEmailVerificationAddress(
    page: Pick<Page, 'evaluate'>,
    email: string
): Promise<void> {
    const filled = await page.evaluate(address => {
        const visible = (element: Element): boolean => element.getClientRects().length > 0;
        const input = Array.from(document.querySelectorAll<HTMLInputElement>(
            '#email, input[type="email"], input[autocomplete="email"]'
        )).find(candidate => visible(candidate) && !candidate.disabled && !candidate.readOnly);
        if (!input)
            return false;

        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, address);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
        return true;
    }, email);

    if (!filled)
        throw new Error('Proton 邮箱验证失败：邮箱输入框未显示');
}

function sanitizeMessage(message: string, email: string): string {
    return message
        .replaceAll(email, '[EMAIL]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
}

function isMeaningfulError(message: string): boolean {
    return /error|failed|unable|invalid|try again|too many|rate limit|temporar|not available|blocked|problem|错误|失败|无效|稍后|频繁|限制/i.test(message);
}

async function readEmailVerificationState(page: Pick<Page, 'evaluate'>): Promise<EmailVerificationState> {
    return page.evaluate(() => {
        const visible = (element: Element): boolean => element.getClientRects().length > 0;
        const verificationInput = document.querySelector('#verification');
        if (verificationInput && visible(verificationInput))
            return { sent: true };

        const bodyText = document.body?.innerText ?? '';
        if (/verification code (?:has been|was) sent|enter (?:the )?verification code|resend (?:the )?code/i.test(bodyText))
            return { sent: true };

        const errorSelectors = [
            '[role="alert"]',
            '[aria-live="assertive"]',
            '.notification--error',
            '.field-two-container--invalid',
            '[data-testid*="error"]'
        ];
        const error = errorSelectors
            .flatMap(selector => Array.from(document.querySelectorAll(selector)))
            .find(element => visible(element) && (element.textContent ?? '').trim());

        return { sent: false, error: (error?.textContent ?? '').trim() || undefined };
    });
}

async function clickEmailVerificationButton(page: Pick<Page, 'evaluate'>): Promise<VerificationButtonState> {
    return page.evaluate(() => {
        const visible = (element: Element): boolean => element.getClientRects().length > 0;
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
            .filter(button => (button.innerText ?? button.textContent ?? '').replace(/\s+/g, ' ').trim() === 'Get verification code'
                && visible(button));
        const enabled = buttons.find(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
        if (enabled) {
            enabled.click();
            return 'clicked';
        }
        return buttons.length ? 'disabled' : 'missing';
    });
}

export async function requestEmailVerificationCode(
    page: Pick<Page, 'evaluate'>,
    email: string,
    options: EmailVerificationRequestOptions = {}
): Promise<Date> {
    const attempts = options.attempts ?? 2;
    const pollsPerAttempt = options.pollsPerAttempt ?? 30;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const requestedAt = new Date();
        const buttonState = await clickEmailVerificationButton(page);
        if (buttonState !== 'clicked')
            throw new Error(`Proton 邮箱验证码发送失败：发送按钮${buttonState === 'disabled' ? '当前不可用' : '未显示'}`);

        for (let poll = 0; poll < pollsPerAttempt; poll++) {
            const state = await readEmailVerificationState(page);
            if (state.error && isMeaningfulError(state.error))
                throw new Error(`Proton 邮箱验证码发送失败：${sanitizeMessage(state.error, email)}`);
            if (state.sent)
                return requestedAt;
            if (poll + 1 < pollsPerAttempt)
                await wait(pollIntervalSeconds);
        }
    }

    throw new Error(`Proton 邮箱验证码发送失败：点击发送按钮 ${attempts} 次后，页面仍未进入验证码输入阶段`);
}