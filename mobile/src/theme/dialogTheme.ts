// Imperative system/web dialogs cannot consume React context. ThemeProvider
// publishes its resolved appearance here so they follow the app preference.
let colorScheme: 'light' | 'dark' | undefined;

export function setDialogColorScheme(value: typeof colorScheme) { colorScheme = value; }
export function getDialogColorScheme() { return colorScheme; }
