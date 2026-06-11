import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket, { disconnectSocket, reconnectSocket } from "../../services/socket-io";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

let isRefreshing = false;
let failedQueue = [];
let interceptorsRegistered = false;
let refreshTimer = null;

const processQueue = (error, token = null) => {
	failedQueue.forEach(prom => {
		if (error) prom.reject(error);
		else prom.resolve(token);
	});
	failedQueue = [];
};

const refreshAccessToken = async () => {
	if (isRefreshing) return null;
	isRefreshing = true;
	try {
		const { data } = await api.post("/auth/refresh_token");
		localStorage.setItem("token", JSON.stringify(data.token));
		api.defaults.headers.Authorization = `Bearer ${data.token}`;
		processQueue(null, data.token);
		reconnectSocket();
		scheduleProactiveRefresh(data.token);
		return data;
	} catch (err) {
		processQueue(err, null);
		throw err;
	} finally {
		isRefreshing = false;
	}
};

const scheduleProactiveRefresh = (jwt) => {
	if (refreshTimer) clearTimeout(refreshTimer);
	try {
		const { exp } = JSON.parse(atob(jwt.split(".")[1]));
		const delay = exp * 1000 - Date.now() - 60000; // 60s before expiry
		refreshTimer = setTimeout(() => {
			refreshAccessToken().catch(() => {});
		}, Math.max(delay, 10000));
	} catch (err) {
		// malformed token — interceptor fallback will handle it
	}
};

const useAuth = () => {
	const history = useHistory();
	const [isAuth, setIsAuth] = useState(false);
	const [loading, setLoading] = useState(true);
	const [user, setUser] = useState({});

	// Register interceptors synchronously so they're active before any request fires.
	// Module-level flag prevents accumulation across re-renders.
	if (!interceptorsRegistered) {
		interceptorsRegistered = true;

		api.interceptors.request.use(
			config => {
				const token = localStorage.getItem("token");
				if (token) {
					config.headers["Authorization"] = `Bearer ${JSON.parse(token)}`;
					setIsAuth(true);
				}
				return config;
			},
			error => Promise.reject(error)
		);

		api.interceptors.response.use(
			response => response,
			async error => {
				const originalRequest = error.config;

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

					try {
						const data = await refreshAccessToken();
						if (data === null) {
							// already refreshing, wait in queue
							return new Promise((resolve, reject) => {
								failedQueue.push({ resolve, reject });
							})
								.then(token => {
									originalRequest.headers["Authorization"] = `Bearer ${token}`;
									return api(originalRequest);
								})
								.catch(err => Promise.reject(err));
						}
						setUser(data.user);
						return api(originalRequest);
					} catch (err) {
						localStorage.removeItem("token");
						api.defaults.headers.Authorization = undefined;
						setIsAuth(false);
						return Promise.reject(err);
					}
				}

				if (error?.response?.status === 401) {
					localStorage.removeItem("token");
					api.defaults.headers.Authorization = undefined;
					setIsAuth(false);
				}

				return Promise.reject(error);
			}
		);
	}

	useEffect(() => {
		const token = localStorage.getItem("token");
		(async () => {
			if (token) {
				try {
					const data = await refreshAccessToken();
					if (data) {
						setIsAuth(true);
						setUser(data.user);
					}
				} catch (err) {
					localStorage.removeItem("token");
					toastError(err);
				}
			}
			setLoading(false);
		})();
	}, []);

	useEffect(() => {
		const socket = openSocket();

		const handleUser = (data) => {
			if (data.action === "update" && data.user.id === user.id) {
				setUser(data.user);
			}
		};
		socket.on("user", handleUser);

		return () => {
			socket.off("user", handleUser);
		};
	}, [user]);

	useEffect(() => {
		const handleSocketAuthFailure = () => {
			if (!localStorage.getItem("token")) return;
			refreshAccessToken().catch(() => {});
		};
		window.addEventListener("socket-auth-failure", handleSocketAuthFailure);
		return () => window.removeEventListener("socket-auth-failure", handleSocketAuthFailure);
	}, []);

	const handleLogin = async userData => {
		setLoading(true);

		try {
			const { data } = await api.post("/auth/login", userData);
			localStorage.setItem("token", JSON.stringify(data.token));
			api.defaults.headers.Authorization = `Bearer ${data.token}`;
			setUser(data.user);
			setIsAuth(true);
			scheduleProactiveRefresh(data.token);
			reconnectSocket();
			toast.success(i18n.t("auth.toasts.success"));
			history.push("/tickets");
			setLoading(false);
		} catch (err) {
			toastError(err);
			setLoading(false);
		}
	};

	const handleLogout = async () => {
		setLoading(true);

		try {
			if (refreshTimer) clearTimeout(refreshTimer);
			await api.delete("/auth/logout");
			setIsAuth(false);
			setUser({});
			localStorage.removeItem("token");
			disconnectSocket();
			api.defaults.headers.Authorization = undefined;
			setLoading(false);
			history.push("/login");
		} catch (err) {
			toastError(err);
			setLoading(false);
		}
	};

	return { isAuth, user, loading, handleLogin, handleLogout };
};

export default useAuth;
