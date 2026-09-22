// How the connection state is decided, and how it is worded.
//
// Separate from connectivity.js because that file talks to Capacitor and the
// network; this one is the reasoning, and can be tested on its own.

/**
 * Works out the status from what we know. Kept separate and pure so the
 * decisions can be tested without a network.
 */
export function decideStatus({ hasInterface, probeOk }) {
  if (!hasInterface) return 'offline';
  if (probeOk === false) return 'no-internet';
  if (probeOk === true) return 'online';
  return 'checking';
}

/** The message to show for a status. */
export function describe(status, connectionType) {
  if (status === 'offline') {
    return {
      title: 'No connection',
      text: 'Your phone is not connected to anything. Turn off airplane mode, or turn on Wi-Fi or mobile data.',
      tone: 'offline',
    };
  }
  if (status === 'no-internet') {
    return {
      title: 'No internet',
      text:
        connectionType === 'wifi'
          ? 'You are connected to Wi-Fi, but it has no internet. Try another network.'
          : connectionType === 'cellular'
            ? 'Mobile data is on, but nothing is getting through. Check your signal or your data balance.'
            : 'You are connected to a network, but nothing is getting through.',
      tone: 'no-internet',
    };
  }
  return null;
}
