import './loadEnv.js';
import './patches.js';
import os from 'os';
import { randomBytes } from 'crypto';
import puppeteer, { Browser, Page } from 'puppeteer';
import { authenticator } from 'otplib';
import Utility from './Utility.js';
import logger from './logger.js';
import githubAnnotation from './annotations.js';
import { OutlookCredentials, preflightOutlook, waitForProtonVerificationCode } from './outlookMail.js';
import { formatProtonAccount } from './accountResult.js';

const MAX_TIMEOUT = Math.pow(2, 31) - 1;
const VERIFICATION_TIMEOUT_MS = 90_000;

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`缺少环境变量 ${name}`);
    return value;
}

function outlookCredentialsFromEnv(): OutlookCredentials {
    return {
        email: requiredEnv('EMAIL'),
        clientId: requiredEnv('CLIENT_ID'),
        refreshToken: requiredEnv('REFRESH_TOKEN')
    };
}

function generateUsername(email: string): string {
    const localPart = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    const prefix = /^[a-zA-Z]/.test(localPart) ? localPart : `p${localPart}`;
    return `${prefix || 'proton'}${randomBytes(4).toString('hex')}`.slice(0, 32);
}

function generatePassword(): string {
    return `Proton!${randomBytes(15).toString('base64url')}9a`;
}

async function captureScreenshots(browser: Browser): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const [index, page] of (await browser.pages()).entries())
        await page.screenshot({ path: `./images/error-${timestamp}-${index + 1}.png` }).catch(error => logger.warn('截图失败：%s', error.message));
}

async function enterSixDigitCode(page: Page, code: string): Promise<void> {
    for (let index = 0; index < 6; index++)
        await page.type(`//input[@aria-label='Enter verification code. Digit ${index + 1}.']`, code[index]);
}

async function receiveVerificationCode(
    credentials: OutlookCredentials,
    receivedAfter: Date,
    excludeCodes: string[] = []
): Promise<string> {
    logger.info('等待 Proton 验证邮件');
    const code = await waitForProtonVerificationCode(credentials, {
        receivedAfter,
        timeoutMs: VERIFICATION_TIMEOUT_MS,
        excludeCodes
    });
    logger.info('收到 Proton 验证邮件');
    return code;
}

async function registerProton(page: Page, credentials: OutlookCredentials): Promise<void> {
    const password = generatePassword();
    const username = generateUsername(credentials.email);

    await page.goto('https://account.proton.me/mail/signup?plan=free');
    const accountFrame = await page.waitForFrame(frame => frame.url().includes('account-api.proton.me/challenge') && frame.url().includes('Name=email'), { timeout: 60_000 });
    await accountFrame.type("//input[@id='username']", username);
    await page.type("//input[@id='password']", password);
    await page.type("//input[@id='password-confirm']", password);

    let protonMail = '';
    while (!protonMail) {
        await page.click("//button[text()='Start using Proton Mail now']");
        if (!await accountFrame.$x("//span[text()='Username already used']", { timeout: 5_000 })) {
            protonMail = `${await accountFrame.textContent("//input[@id='username']")}@proton.me`;
            break;
        }
        logger.info('Proton 用户名已被使用，重新生成');
        await accountFrame.type("//input[@id='username']", generateUsername(credentials.email));
    }
    logger.info('Proton 邮箱地址：%s', protonMail);

    const noThanks = await page.$x("//button[text()='No, thanks']", { timeout: 10_000 });
    if (noThanks) await noThanks.click();
    await page.$x("//h1[text()='Human Verification']", { timeout: 60_000 });
    const emailVerification = await page.$x("//button[.//span[text()='Email']]", { timeout: 10_000 });
    if (!emailVerification)
        throw new Error('Proton 当前未提供邮箱验证方式，无法使用 Outlook 辅助完成注册');

    await emailVerification.click();
    await page.type("//input[@id='email']", credentials.email);
    const signupVerificationStartedAt = new Date();
    await page.click("//button[text()='Get verification code']");
    const signupCode = await receiveVerificationCode(credentials, signupVerificationStartedAt);
    await page.type("//input[@id='verification']", signupCode);
    await page.click("//button[text()='Verify']");

    await page.click("//input[@id='understood-recovery-necessity']", { timeout: MAX_TIMEOUT });
    await page.click("//button[text()='Continue' and not(@disabled)]");
    await page.click("//button[text()='Continue']");
    await page.click("//button[text()=\"Let's get started\"]", { timeout: MAX_TIMEOUT });
    await page.click("//button[text()='Maybe later']");
    await page.click("//button[text()='Next']");
    await page.click("//button[text()='Use this']");

    await page.goto('https://account.proton.me/u/0/mail/recovery');
    await page.click("//a[text()='Safeguard account now']");
    await page.click("//div[normalize-space(.)='Show more (2)']");
    await page.click("//h2[text()='Add a recovery email address']");
    await page.type("//input[@id='recovery-email-input']", credentials.email);
    const recoveryVerificationStartedAt = new Date();
    await page.click("//button[text()='Add email address']");
    await page.type("//input[@id='password']", password);
    await page.click("//button[text()='Authenticate']");
    const recoveryCode = await receiveVerificationCode(credentials, recoveryVerificationStartedAt, [signupCode]);
    await enterSixDigitCode(page, recoveryCode);
    await page.click("//button[text()='Verify']");
    logger.info('Proton 恢复邮箱设置完成');

    await page.goto('https://account.proton.me/u/0/mail/account-password');
    await page.click("//label[@for='twoFactorToggle']");
    await page.type("//input[@id='password']", password);
    await page.click("//button[text()='Authenticate']");
    await page.click("//button[text()='Next']");
    await page.click("//button[text()='Enter key manually instead']");
    const otpSecret = await page.textContent("//code[@data-testid='totp:secret-key']");
    await page.click("//button[text()='Next']");
    await enterSixDigitCode(page, authenticator.generate(otpSecret));
    await page.click("//button[text()='Submit']");
    await page.click("//button[text()='Close']");
    logger.info('Proton 2FA 设置完成');

    Utility.appendStepSummary(formatProtonAccount(protonMail.split('@')[0], password, otpSecret));
    logger.info('Proton 邮箱注册完成');
}

(async () => {
    let browser: Browser | undefined;
    try {
        const credentials = outlookCredentialsFromEnv();
        await preflightOutlook(credentials);
        browser = await puppeteer.launch({
            headless: os.platform() === 'linux', defaultViewport: null, protocolTimeout: MAX_TIMEOUT, slowMo: 20,
            handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
            args: [
                '--lang=en-US', '--window-size=1920,1080', '--disable-blink-features=AutomationControlled',
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-zygote', '--disable-gpu'
            ]
        });
        logger.info(browser.process()?.spawnfile, await browser.version());
        await registerProton((await browser.pages())[0], credentials);
    }
    catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        githubAnnotation('error', message);
        if (browser) await captureScreenshots(browser);
        process.exitCode = 1;
    }
    finally {
        await browser?.close().catch(() => undefined);
    }
})();