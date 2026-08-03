export const PLAYWRIGHT_BROWSER_CHANNEL_ENV = "PLAYWRIGHT_BROWSER_CHANNEL";
export const PLAYWRIGHT_BROWSER_CHANNEL_INVALID = "PLAYWRIGHT_BROWSER_CHANNEL_INVALID";
export const PLAYWRIGHT_BROWSER_NOT_AVAILABLE = "PLAYWRIGHT_BROWSER_NOT_AVAILABLE";

export const ALLOWED_BROWSER_CHANNELS = Object.freeze(["chromium", "chrome", "msedge"]);
export const DEFAULT_BROWSER_CHANNELS = Object.freeze(["chromium", "chrome", "msedge"]);

export function buildBrowserLaunchOptions({ channel, headed = false }) {
  return Object.freeze({
    channel,
    headless: !headed,
  });
}

export function resolveBrowserChannelCandidates({ env = process.env } = {}) {
  const override = env[PLAYWRIGHT_BROWSER_CHANNEL_ENV];
  if (override === undefined) {
    return Object.freeze([...DEFAULT_BROWSER_CHANNELS]);
  }
  if (!ALLOWED_BROWSER_CHANNELS.includes(override)) {
    throw new Error(
      `${PLAYWRIGHT_BROWSER_CHANNEL_INVALID}: expected chromium, chrome, or msedge`,
    );
  }
  return Object.freeze([override]);
}

export async function launchBrowserWithFallback({
  launcher,
  headed = false,
  env = process.env,
  logger = console.log,
}) {
  const channels = resolveBrowserChannelCandidates({ env });
  const attemptedChannels = [];

  for (const channel of channels) {
    const launchOptions = buildBrowserLaunchOptions({ channel, headed });
    try {
      const browser = await launcher.launch(launchOptions);
      logger(`E2E_BROWSER_CHANNEL=${channel}`);
      return Object.freeze({ browser, channel, launchOptions });
    } catch (error) {
      if (!isBrowserNotInstalledLaunchError(error, channel)) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      attemptedChannels.push(channel);
    }
  }

  throw new Error(buildBrowserNotAvailableMessage(attemptedChannels));
}

export function isBrowserNotInstalledLaunchError(error, channel) {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedChannel = channel.toLowerCase();

  return (
    (
      message.includes("executable doesn't exist") ||
      message.includes("executable does not exist") ||
      message.includes("is not found")
    ) &&
    (
      message.includes(normalizedChannel) ||
      message.includes(`'${normalizedChannel}'`) ||
      message.includes(`"${normalizedChannel}"`)
    )
  );
}

function buildBrowserNotAvailableMessage(attemptedChannels) {
  const attempted = attemptedChannels.length === 0 ? "none" : attemptedChannels.join(", ");
  return [
    `${PLAYWRIGHT_BROWSER_NOT_AVAILABLE}: no supported browser channel could be launched.`,
    `Attempted channels: ${attempted}.`,
    "Install Playwright Chromium with: npx.cmd --no-install playwright install --no-shell chromium.",
    "Alternatively install Google Chrome or Microsoft Edge.",
    `Set ${PLAYWRIGHT_BROWSER_CHANNEL_ENV}=chromium, chrome, or msedge to choose one channel explicitly.`,
  ].join(" ");
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
