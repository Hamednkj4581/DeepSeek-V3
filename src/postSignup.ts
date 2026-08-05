import { Page } from 'puppeteer';
import Utility from './Utility.js';

export interface PostSignupPromptOptions {
    maxPolls?: number;
    initialIdlePollsBeforeExit?: number;
    idlePollsBeforeExit?: number;
    pollIntervalSeconds?: number;
    wait?: (seconds: number) => Promise<void>;
}

export async function handlePostSignupPrompts(
    page: Pick<Page, 'evaluate'>,
    options: PostSignupPromptOptions = {}
): Promise<string[]> {
    const maxPolls = options.maxPolls ?? 90;
    const initialIdlePollsBeforeExit = options.initialIdlePollsBeforeExit ?? 60;
    const idlePollsBeforeExit = options.idlePollsBeforeExit ?? 5;
    const pollIntervalSeconds = options.pollIntervalSeconds ?? 1;
    const wait = options.wait ?? Utility.waitForSeconds;
    const actions: string[] = [];
    let idlePolls = 0;

    for (let poll = 0; poll < maxPolls; poll++) {
        const action = await page.evaluate(() => {
            const visible = (element: Element): boolean => element.getClientRects().length > 0;
            const checkbox = document.querySelector<HTMLInputElement>('#understood-recovery-necessity');
            if (checkbox && visible(checkbox) && !checkbox.checked && !checkbox.disabled) {
                checkbox.click();
                return 'understood recovery necessity';
            }

            const labels = ['Continue', "Let's get started", 'Maybe later', 'Next', 'Use this'];
            const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
            const button = buttons.find(candidate =>
                labels.includes((candidate.textContent ?? '').trim())
                && !candidate.disabled
                && visible(candidate)
            );
            if (!button)
                return undefined;

            const label = (button.textContent ?? '').trim();
            button.click();
            return label;
        }).catch(() => undefined);

        if (action) {
            actions.push(action);
            idlePolls = 0;
        }
        else {
            idlePolls++;
        }

        const idleLimit = actions.length ? idlePollsBeforeExit : initialIdlePollsBeforeExit;
        if (idlePolls >= idleLimit)
            break;

        if (poll + 1 < maxPolls)
            await wait(pollIntervalSeconds);
    }

    return actions;
}