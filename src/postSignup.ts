import { Page } from 'puppeteer';
import Utility from './Utility.js';

export interface PostSignupPromptOptions {
    maxPolls?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
}

interface PostSignupState {
    action?: string;
    complete?: boolean;
    error?: string;
    location?: string;
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
    const actions: string[] = [];
    let lastLocation: string | undefined;

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

            const checkbox = document.querySelector<HTMLInputElement>('#understood-recovery-necessity');
            if (checkbox && visible(checkbox) && !checkbox.checked && !checkbox.disabled) {
                checkbox.click();
                return { action: 'understood recovery necessity', location };
            }

            const labels = ['Continue', "Let's get started", 'Maybe later', 'Next', 'Use this'];
            const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
            const button = buttons.find(candidate =>
                labels.includes((candidate.textContent ?? '').trim())
                && !candidate.disabled
                && visible(candidate)
            );
            if (button) {
                const label = (button.textContent ?? '').trim();
                button.click();
                return { action: label, location };
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
        if (state.action)
            actions.push(state.action);

        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    throw new Error(`等待 Proton 完成账号创建超时（${maxPolls * pollIntervalSeconds} 秒），当前页面：${safePageLocation(lastLocation)}`);
}