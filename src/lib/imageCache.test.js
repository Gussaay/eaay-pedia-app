import test from 'node:test';
import assert from 'node:assert/strict';
import { isCacheableImage, cachedImageSrc } from './imageCache.js';

test('only our own explanation pictures are kept on the device', () => {
  assert.equal(isCacheableImage('https://easy-pedia.web.app/explain/long-qt.png'), true);
  assert.equal(isCacheableImage('https://easy-pedia.web.app/explain/kawasaki.png?x=1'), false);
  assert.equal(isCacheableImage('https://firebasestorage.googleapis.com/v0/b/x/o/a.png'), false);
  assert.equal(isCacheableImage(''), false);
  assert.equal(isCacheableImage(undefined), false);
});

test('without the Cache API the original address is used', async () => {
  const url = 'https://easy-pedia.web.app/explain/svt.png';
  assert.equal(await cachedImageSrc(url), url);
  assert.equal(await cachedImageSrc('https://example.com/a.png'), 'https://example.com/a.png');
});
