// Realtime Database access for CI, over REST rather than the Admin SDK.
//
// WHY NOT firebase-admin's getDatabase():
//
// Its database client treats a rejected credential as something worth
// retrying, and retries it for ever. When the service account was not
// authorised for the database, the deploy step did not fail — it printed
// "Provided authentication credentials ... are invalid" every few seconds and
// hung. Two runs sat there for over two hours each, and `continue-on-error`
// cannot rescue a step that never ends.
//
// The REST API answers 401 or 403 straight away, which is what a build step
// needs: a clear, immediate failure with a message saying what to fix.
import { cert } from 'firebase-admin/app';

const TIMEOUT_MS = 20_000;

/**
 * A 401 has two quite different causes, and the fix for one does nothing for
 * the other: either the service account is missing the database role, or it
 * belongs to a different Firebase project altogether. The default database of
 * a project is reachable at <project-id>.firebaseio.com, so comparing the two
 * names tells them apart — but only once the request has actually been
 * refused, so a project using a non-default database instance never sees a
 * false alarm.
 */
function explain401(status, databaseURL, serviceAccount) {
  const instance = new URL(databaseURL).hostname.split('.')[0];
  const project = serviceAccount?.project_id || '(none in the JSON)';

  if (project !== instance) {
    return (
      `The database refused the service account (HTTP ${status}). It was issued by the ` +
      `Firebase project "${project}", but ${databaseURL} belongs to "${instance}". Create ` +
      'a service account in the right project and replace the FIREBASE_SERVICE_ACCOUNT ' +
      'secret with it.'
    );
  }
  return (
    `The database refused the service account (HTTP ${status}). Grant it the "Firebase ` +
    'Realtime Database Admin" role: Google Cloud console -> IAM -> the service account ' +
    `this workflow uses (${serviceAccount?.client_email || 'see the secret'}) -> Grant ` +
    'access. Database rules do not apply here — a service account authenticates with a ' +
    'Google OAuth token, which rules cannot grant.'
  );
}

/**
 * @param databaseURL e.g. https://easy-pedia.firebaseio.com
 * @param serviceAccount the parsed service account JSON
 */
export function restDb(databaseURL, serviceAccount) {
  // cert() also mints OAuth tokens, so no extra dependency is needed.
  const credential = cert(serviceAccount);
  let cached = null;

  const token = async () => {
    if (!cached) cached = (await credential.getAccessToken()).access_token;
    return cached;
  };

  const call = async (method, path, body) => {
    const res = await fetch(`${databaseURL}/${path}.json`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401 || res.status === 403) {
      const error = new Error(explain401(res.status, databaseURL, serviceAccount));
      error.permission = true;
      throw error;
    }
    if (!res.ok) throw new Error(`Database ${method} ${path} failed: HTTP ${res.status}`);

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    get: (path) => call('GET', path),
    /** Merges into the node, like the SDK's update(). */
    update: (path, values) => call('PATCH', path, values),
    /** Replaces the node. */
    set: (path, value) => call('PUT', path, value),
    /** Multi-path atomic write: keys are paths relative to the root. */
    updateRoot: (updates) => call('PATCH', '', updates),
  };
}
