import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket from "../../services/socket-io";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

let isRefreshing = false;
let failedQueue = [];

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

	useEffect(() => {
		const reqId = api.interceptors.request.use(
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

		const resId = api.interceptors.response.use(
			response => response,
			async error => {
				const originalRequest = error.config;

				if (error?.response?.status === 403 && !originalRequest._retry) {
					originalRequest._retry = true;

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

				if (error?.response?.status === 401) {
					localStorage.removeItem("token");
					api.defaults.headers.Authorization = undefined;
					setIsAuth(false);
				}

				return Promise.reject(error);
			}
		);

		return () => {
			api.interceptors.request.eject(reqId);
			api.interceptors.response.eject(resId);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

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

	useEffect(() => {
		const socket = openSocket();

		socket.on("user", data => {
			if (data.action === "update" && data.user.id === user.id) {
				setUser(data.user);
			}
		});

		return () => {
			socket.disconnect();
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
