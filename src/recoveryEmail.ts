import { Page } from 'puppeteer';
import Utility from './Utility.js';

export interface RecoveryEmailDialogOptions {
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

        if (state.ready)
            return actions;
        if (state.action)
            actions.push(state.action);
        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    throw new Error('无法打开 Proton 恢复邮箱设置：页面中未找到可用的邮箱恢复入口');
}
