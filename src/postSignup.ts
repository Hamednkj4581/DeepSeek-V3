import { Page } from 'puppeteer';
import Utility from './Utility.js';

export interface PostSignupPromptOptions {
    maxPolls?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
    onVerificationRequired?: () => Promise<void>;
    maxVerificationRetries?: number;
    verificationConfirmationPolls?: number;
}

interface PostSignupState {
    action?: string;
    complete?: boolean;
    error?: string;
    location?: string;
    verificationRequired?: boolean;
}

function safePageLocation(value: string | undefined): string {
    if (!value)
        return 'unknown';
    try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
    }
    catch {
        return 'unknown';
    }
}

export async function handlePostSignupPrompts(
    page: Pick<Page, 'evaluate'>,
    options: PostSignupPromptOptions = {}
): Promise<string[]> {
    const maxPolls = options.maxPolls ?? 180;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;
    const maxVerificationRetries = options.maxVerificationRetries ?? 1;
    const verificationConfirmationPolls = options.verificationConfirmationPolls ?? 5;
    const actions: string[] = [];
    let lastLocation: string | undefined;
    let verificationRetries = 0;
    let verificationConfirmationCount = 0;

    for (let poll = 0; poll < maxPolls; poll++) {
        const state = await page.evaluate((): PostSignupState => {
            const visible = (element: Element): boolean => element.getClientRects().length > 0;
            const location = window.location.href;
            const authenticatedRoute = /\/u\/\d+(?:\/|$)/.test(window.location.pathname);
            if (authenticatedRoute)
                return { complete: true, location };

            const signInInput = document.querySelector('input[name="username"], input[autocomplete="username"]');
            if (signInInput && visible(signInInput))
                return { error: '注册后被重定向到登录页，账号会话未建立', location };

            const verificationEmail = document.querySelector('#email');
            const verificationCode = document.querySelector('#verification');
            const humanVerification = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
                .some(element => visible(element) && /human verification/i.test(element.textContent ?? ''));
            if (verificationEmail && visible(verificationEmail) && humanVerification
                && !(verificationCode && visible(verificationCode)))
                return { verificationRequired: true, location };

            const checkbox = document.querySelector<HTMLInputElement>('#understood-recovery-necessity');
            if (checkbox && visible(checkbox) && !checkbox.checked && !checkbox.disabled) {
                checkbox.click();
                return { action: 'understood recovery necessity', location };
            }

            const labels = [
                'No, thanks',
                'Start using Proton Mail now',
                'Continue',
                "Let's get started",
                'Maybe later',
                'Next',
                'Use this'
            ];
            const controls = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'));
            const target = labels
                .map(label => ({
                    label,
                    element: controls.find(candidate =>
                        (candidate.innerText ?? candidate.textContent ?? '').replace(/\s+/g, ' ').trim() === label
                        && !candidate.hasAttribute('disabled')
                        && candidate.getAttribute('aria-disabled') !== 'true'
                        && visible(candidate)
                    )
                }))
                .find(candidate => candidate.element);
            if (target?.element) {
                target.element.click();
                return { action: target.label, location };
            }

            const alert = Array.from(document.querySelectorAll('[role="alert"], .notification--error'))
                .find(element => visible(element) && (element.textContent ?? '').trim());
            const alertText = (alert?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
            const error = /error|failed|unable|invalid|try again|too many|temporar|blocked|problem/i.test(alertText)
                ? alertText
                : undefined;
            return { error, location };
        }).catch((): PostSignupState => ({}));

        lastLocation = state.location ?? lastLocation;
        if (state.error)
            throw new Error(`Proton 注册完成阶段失败：${state.error}`);
        if (state.complete)
            return actions;
        if (state.verificationRequired) {
            verificationConfirmationCount++;
            if (verificationConfirmationCount < verificationConfirmationPolls) {
                if (poll + 1 < maxPolls)
                    await wait(pollIntervalSeconds);
                continue;
            }
            verificationConfirmationCount = 0;
            if (!options.onVerificationRequired)
                throw new Error('Proton 注册完成阶段再次要求邮箱验证，但未配置验证处理器');
            if (verificationRetries >= maxVerificationRetries)
                throw new Error(`Proton 注册完成阶段重复要求邮箱验证，已达到 ${maxVerificationRetries} 次重试上限`);
            verificationRetries++;
            await options.onVerificationRequired();
            actions.push('Email verification');
        }
        else {
            verificationConfirmationCount = 0;
        }
        if (state.action)
            actions.push(state.action);

        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    throw new Error(`等待 Proton 完成账号创建超时（${maxPolls * pollIntervalSeconds} 秒），当前页面：${safePageLocation(lastLocation)}`);
}