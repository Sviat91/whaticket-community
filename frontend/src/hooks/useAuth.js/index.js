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

const processQueue = (error, token = null) => {
	failedQueue.forEach(prom => {
		if (error) prom.reject(error);
		else prom.resolve(token);
	});
	failedQueue = [];
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

					isRefreshing = true;

					try {
						const { data } = await api.post("/auth/refresh_token");
						if (data) {
							localStorage.setItem("token", JSON.stringify(data.token));
							api.defaults.headers.Authorization = `Bearer ${data.token}`;
							setUser(data.user);
							processQueue(null, data.token);
							reconnectSocket();
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
				isRefreshing = true;
				try {
					const { data } = await api.post("/auth/refresh_token");
					localStorage.setItem("token", JSON.stringify(data.token));
					api.defaults.headers.Authorization = `Bearer ${data.token}`;
					setIsAuth(true);
					setUser(data.user);
					processQueue(null, data.token);
					reconnectSocket();
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

	const handleLogin = async userData => {
		setLoading(true);

		try {
			const { data } = await api.post("/auth/login", userData);
			localStorage.setItem("token", JSON.stringify(data.token));
			api.defaults.headers.Authorization = `Bearer ${data.token}`;
			setUser(data.user);
			setIsAuth(true);
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
