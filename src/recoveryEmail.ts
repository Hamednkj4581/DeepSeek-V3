import { Page } from 'puppeteer';
import Utility from './Utility.js';

export interface RecoveryEmailDialogOptions {
    maxPolls?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
}

export interface RecoveryEmailSubmitOptions {
    maxPolls?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
}

export interface RecoveryEmailVerificationOptions {
    maxPolls?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
}

export async function openRecoveryEmailDialog(
    page: Pick<Page, 'evaluate'>,
    options: RecoveryEmailDialogOptions = {}
): Promise<string[]> {
    const maxPolls = options.maxPolls ?? 30;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;
    const actions: string[] = [];

    for (let poll = 0; poll < maxPolls; poll++) {
        const state = await page.evaluate(() => {
            const visible = (element: Element): boolean => element.getClientRects().length > 0;
            const signInInput = document.querySelector('input[name="username"], input[autocomplete="username"]');
            if (signInInput && visible(signInInput))
                return { ready: false, authenticationRequired: true };
            const input = document.querySelector('#recovery-email-input');
            if (input && visible(input))
                return { ready: true };

            const labels = [
                'Add an email address',
                'Email verification',
                'Add recovery options',
                'Safeguard account now',
                'Show more (2)',
                'Add a recovery email address'
            ];
            const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
                .filter(element => visible(element) && !element.hasAttribute('disabled'));
            const target = labels
                .map(label => ({ label, element: candidates.find(candidate => (candidate.innerText ?? '').includes(label)) }))
                .find(candidate => candidate.element);
            if (!target?.element)
                return { ready: false };

            target.element.click();
            return { ready: false, action: target.label };
        }).catch(() => ({ ready: false, action: undefined }));

        if ('authenticationRequired' in state && state.authenticationRequired)
            throw new Error('无法设置 Proton 恢复邮箱：注册会话已失效并被重定向到登录页');
        if (state.ready)
            return actions;
        if (state.action)
            actions.push(state.action);
        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    throw new Error('无法打开 Proton 恢复邮箱设置：页面中未找到可用的邮箱恢复入口');
}

export async function submitRecoveryEmail(
    page: Pick<Page, 'evaluate'>,
    options: RecoveryEmailSubmitOptions = {}
): Promise<string> {
    const maxPolls = options.maxPolls ?? 30;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;

    for (let poll = 0; poll < maxPolls; poll++) {
        const label = await page.evaluate(() => {
            const visible = (element: Element): boolean => element.getClientRects().length > 0;
            const labels = ['Add and verify', 'Add email address'];
            const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
            const button = buttons.find(candidate =>
                labels.includes((candidate.innerText ?? '').trim())
                && visible(candidate)
                && !candidate.disabled
            );
            if (!button)
                return undefined;

            const buttonLabel = (button.innerText ?? '').trim();
            button.click();
            return buttonLabel;
        }).catch(() => undefined);

        if (label)
            return label;
        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    throw new Error('无法提交 Proton 恢复邮箱：页面中未找到可用的 Add and verify 按钮');
}

export async function requestRecoveryEmailVerification(
    page: Pick<Page, 'evaluate'>,
    options: RecoveryEmailVerificationOptions = {}
): Promise<Date> {
    const maxPolls = options.maxPolls ?? 30;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;

    for (let poll = 0; poll < maxPolls; poll++) {
        const requestedAt = new Date();
        const clicked = await page.evaluate(() => {
            const visible = (element: Element): boolean => element.getClientRects().length > 0;
            const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
                .find(candidate =>
                    (candidate.innerText ?? '').replace(/\s+/g, ' ').trim() === 'Verify with email'
                    && visible(candidate)
                    && !candidate.disabled
                    && candidate.getAttribute('aria-disabled') !== 'true'
                );
            if (!button)
                return false;

            button.click();
            return true;
        }).catch(() => false);

        if (clicked)
            return requestedAt;
        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    throw new Error('无法验证 Proton 恢复邮箱：页面中未找到可用的 Verify with email 按钮');
}
