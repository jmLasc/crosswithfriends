const linkExpanderUserAgentSubstrings = {
  Discord: 'Discordbot',
  Slack: 'Slackbot-LinkExpanding',
  FB_Messenger: 'facebookexternalhit',
  Twitter: 'Twitterbot',
  LinkedIn: 'LinkedInBot',
  WhatsApp: 'WhatsApp',
  Telegram: 'TelegramBot',
  Apple: 'Applebot',
  Google: 'Googlebot',
  Signal: 'SignalBot',
};

export function isFBMessengerCrawler(userAgent: string) {
  return userAgent.includes(linkExpanderUserAgentSubstrings.FB_Messenger);
}

export function islinkExpanderBot(userAgent: string) {
  return Object.values(linkExpanderUserAgentSubstrings).some((ua) => userAgent.includes(ua));
}
