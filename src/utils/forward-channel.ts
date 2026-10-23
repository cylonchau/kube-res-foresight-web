type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Where the channel writes a message: the transport and the stream, topic or module. */
export function channelTarget(ch: Api.Telegram.ForwardChannel, t: Translate) {
  if (ch.transport === 'redis_stream') {
    return `${t('page.telegram.forwardChannels.transports.redis_stream')} ${ch.stream}${ch.redis_addr ? ` @ ${ch.redis_addr}` : ''}`;
  }
  if (ch.transport === 'kafka') {
    return `${t('page.telegram.forwardChannels.transports.kafka')} ${ch.topic} @ ${ch.brokers}`;
  }
  return t('page.telegram.forwardChannels.transports.direct');
}

/** Who reads it and what handles the message at the end. */
export function channelConsumer(ch: Api.Telegram.ForwardChannel, t: Translate) {
  const group = ch.consumer_group ? ` (${ch.consumer_group})` : '';
  if (ch.consumer_kind === 'external') {
    return `${t('page.telegram.forwardChannels.consumers.external')}${group}`;
  }
  const module = t(`page.telegram.forwardChannels.modules.${ch.consumer_kind}`, { ref: ch.consumer_ref });
  return ch.transport === 'direct' ? module : `${t('page.telegram.forwardChannels.builtIn')}${group} → ${module}`;
}

/** The whole path, written once: message → place → consumer → module. */
export function channelPath(ch: Api.Telegram.ForwardChannel, t: Translate) {
  return `${channelTarget(ch, t)} → ${channelConsumer(ch, t)}`;
}
