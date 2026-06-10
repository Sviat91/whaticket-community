# Plan: Fix 403 Spam on Token Expiry

## Root causes (from analysis)
1. Startup refresh in `useAuth` gets new token but does NOT save to `localStorage`. Request interceptor reads localStorage on every request → overrides Authorization with old expired token → 403 on all subsequent requests.
2. `isRefreshing` is not set during startup refresh → concurrent interceptor-triggered refresh races with startup refresh.
3. Socket singleton bakes token into query params at creation time. After token refresh, socket reconnects with old token.

## Files to change: 2

---

## File 1: `frontend/src/hooks/useAuth.js/index.js`

### Change 1A — Fix startup refresh (lines 98–113)

Replace the entire startup `useEffect`:

FROM:
```js
useEffect(() => {
	const token = localStorage.getItem("token");
	(async () => {
		if (token) {
			try {
				const { data } = await api.post("/auth/refresh_token");
				api.defaults.headers.Authorization = `Bearer ${data.token}`;
				setIsAuth(true);
				setUser(data.user);
			} catch (err) {
				toastError(err);
			}
		}
		setLoading(false);
	})();
}, []);
```

TO:
```js
useEffect(() => {
	const token = localStorage.getItem("token");
	(async () => {
		if (token) {
			isRefreshing = true;
			try {
				const { data } = await api.post("/auth/refresh_token");
				localStorage.setItem("token", JSON.stringify(data.token));
				api.defaults.headers.Authorization = `Bearer ${data.token}`;
				setIsAuth(true);
				setUser(data.user);
				processQueue(null, data.token);
			} catch (err) {
				processQueue(err, null);
				localStorage.removeItem("token");
				toastError(err);
			} finally {
				isRefreshing = false;
			}
		}
		setLoading(false);
	})();
}, []);
```

### Change 1B — Add guard to response interceptor to prevent refresh-on-refresh loop (lines 46–95)

In the response interceptor, inside the `if (error?.response?.status === 403 && !originalRequest._retry)` block, add a guard at the very top of that block:

AFTER the line `originalRequest._retry = true;`, ADD:
```js
					if (originalRequest.url?.includes("/auth/refresh_token")) {
						localStorage.removeItem("token");
						api.defaults.headers.Authorization = undefined;
						setIsAuth(false);
						return Promise.reject(error);
					}
```

So the full block becomes:
```js
			if (error?.response?.status === 403 && !originalRequest._retry) {
					originalRequest._retry = true;

					if (originalRequest.url?.includes("/auth/refresh_token")) {
						localStorage.removeItem("token");
						api.defaults.headers.Authorization = undefined;
						setIsAuth(false);
						return Promise.reject(error);
					}

					if (isRefreshing) {
						return new Promise((resolve, reject) => {
							failedQueue.push({ resolve, reject });
						})
							.then(token => {
								originalRequest.headers["Authorization"] = `Bearer ${token}`;
								return api(originalRequest);
							})
							.catch(err => Promise.reject(err));
					}

					isRefreshing = true;

					try {
						const { data } = await api.post("/auth/refresh_token");
						if (data) {
							localStorage.setItem("token", JSON.stringify(data.token));
							api.defaults.headers.Authorization = `Bearer ${data.token}`;
							setUser(data.user);
							processQueue(null, data.token);
						}
						return api(originalRequest);
					} catch (err) {
						processQueue(err, null);
						localStorage.removeItem("token");
						api.defaults.headers.Authorization = undefined;
						setIsAuth(false);
						return Promise.reject(err);
					} finally {
						isRefreshing = false;
					}
				}
```

---

## File 2: `frontend/src/services/socket-io.js`

### Change 2A — Add `reconnectSocket` export

Replace the entire file content with:

```js
import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

let socket = null;

function connectToSocket() {
  if (!socket) {
    const token = localStorage.getItem("token");
    socket = openSocket(getBackendUrl(), {
      transports: ["websocket", "polling", "flashsocket"],
      query: { token: JSON.parse(token) },
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  // connectToSocket() will pick up the new token from localStorage on next call
}

export default connectToSocket;
```

### Change 2B — Call `reconnectSocket` after successful refresh in `useAuth.js/index.js`

In the import line at the top of `useAuth.js/index.js`:

FROM:
```js
import openSocket, { disconnectSocket } from "../../services/socket-io";
```
TO:
```js
import openSocket, { disconnectSocket, reconnectSocket } from "../../services/socket-io";
```

Then in the response interceptor, after `processQueue(null, data.token)`:
```js
processQueue(null, data.token);
reconnectSocket();
```

And in the startup useEffect, after `processQueue(null, data.token)`:
```js
processQueue(null, data.token);
reconnectSocket();
```

---

## Verification steps
1. `cd frontend && npm run build` — must pass with 0 errors
2. Check: no TypeScript/ESLint import errors
3. Logic check:
   - Startup sets `isRefreshing = true` before refresh call
   - Startup saves new token to `localStorage`
   - Startup calls `processQueue` and `reconnectSocket` on success
   - Guard prevents `/auth/refresh_token` from entering retry loop
   - `reconnectSocket` only clears socket; next `connectToSocket()` call creates fresh one with new token
