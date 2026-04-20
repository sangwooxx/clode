export function getLoginStatusMessage(reason: string | null | undefined) {
  if (reason === "session-expired") {
    return "Sesja wygasla lub jest nieprawidlowa. Zaloguj sie ponownie.";
  }

  return null;
}
