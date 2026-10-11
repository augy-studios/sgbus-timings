// One push, to whichever kind of subscription the device sent (api/_push/validate.js): a
// browser's Web Push subscription, through web-push, or the Android app's FCM token,
// { fcm }, through api/_push/fcm.js. Either throws an error with statusCode 404 or 410 when
// the subscription is gone for good. Callers set web-push's VAPID details first.

import webpush from 'web-push';
import { sendFcm } from './fcm.js';

export function sendPush(subscription, payload, { ttl, urgency }) {
  if (subscription?.fcm) return sendFcm(subscription.fcm, payload, { ttl, urgency });
  return webpush.sendNotification(subscription, payload, { TTL: ttl, urgency });
}
