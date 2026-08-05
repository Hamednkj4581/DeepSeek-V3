export function formatProtonAccount(username: string, password: string, otpSecret: string): string {
    return [username, password, otpSecret].join('----');
}