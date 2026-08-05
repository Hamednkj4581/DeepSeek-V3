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

function sanitizeMessage(message: string, email: string): string {
    return message
        .replaceAll(email, '[EMAIL]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
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

export async function requestEmailVerificationCode(
    page: Pick<Page, 'click' | 'evaluate'>,
    email: string,
    options: EmailVerificationRequestOptions = {}
): Promise<Date> {
    const attempts = options.attempts ?? 2;
    const pollsPerAttempt = options.pollsPerAttempt ?? 15;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const requestedAt = new Date();
        await page.click("//button[normalize-space(.)='Get verification code']");

        for (let poll = 0; poll < pollsPerAttempt; poll++) {
            const state = await readEmailVerificationState(page);
            if (state.error)
                throw new Error(`Proton 邮箱验证码发送失败：${sanitizeMessage(state.error, email)}`);
            if (state.sent)
                return requestedAt;
            if (poll + 1 < pollsPerAttempt)
                await wait(pollIntervalSeconds);
        }
    }

    throw new Error(`Proton 邮箱验证码发送失败：点击发送按钮 ${attempts} 次后，页面仍未进入验证码输入阶段`);
}