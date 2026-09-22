import test from 'node:test';
import assert from 'node:assert/strict';
import { decideStatus, describe as describeStatus } from './connectionState.js';

test('no network interface at all is "offline"', () => {
  assert.equal(decideStatus({ hasInterface: false }), 'offline');
  assert.equal(decideStatus({ hasInterface: false, probeOk: true }), 'offline');
});

test('an interface that cannot reach anything is "no-internet", not "online"', () => {
  // This is the whole point of the module. navigator.onLine says "connected"
  // on a Wi-Fi network with broken DNS, which is how every request could fail
  // while the app showed no warning at all.
  assert.equal(decideStatus({ hasInterface: true, probeOk: false }), 'no-internet');
});

test('only a request that actually got through counts as online', () => {
  assert.equal(decideStatus({ hasInterface: true, probeOk: true }), 'online');
  assert.equal(
    decideStatus({ hasInterface: true }),
    'checking',
    'an unfinished probe must not be reported as working',
  );
});

test('each state gets wording a non-technical user can act on', () => {
  const offline = describeStatus('offline');
  assert.match(offline.text, /airplane mode|Wi-Fi|mobile data/i);

  const wifi = describeStatus('no-internet', 'wifi');
  assert.match(wifi.text, /Wi-Fi/i);
  assert.notEqual(wifi.text, describeStatus('no-internet', 'cellular').text);

  const cellular = describeStatus('no-internet', 'cellular');
  assert.match(cellular.text, /signal|data balance/i);

  // Nothing is shown while things are fine.
  assert.equal(describeStatus('online'), null);
  assert.equal(describeStatus('checking'), null);
});

test('the two broken states are told apart, because the fix differs', () => {
  assert.notEqual(describeStatus('offline').title, describeStatus('no-internet').title);
});
