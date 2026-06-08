import React, { useState, useEffect } from "react";
import { makeStyles } from "@material-ui/core/styles";

import ModalImage from "react-modal-image";
import api from "../../services/api";

const useStyles = makeStyles(theme => ({
	messageMedia: {
		objectFit: "cover",
		width: 250,
		height: 200,
		borderRadius: 8,
		display: "block",
	},
	imageWrapper: {
		"& > span, & > div, & img": {
			borderRadius: 8,
			display: "block",
		},
		"& > span": {
			backgroundColor: "transparent !important",
		},
	},
}));

const ModalImageCors = ({ imageUrl }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState("");

	useEffect(() => {
		if (!imageUrl) return;
		const fetchImage = async () => {
			const { data, headers } = await api.get(imageUrl, {
				responseType: "blob",
			});
			const url = window.URL.createObjectURL(
				new Blob([data], { type: headers["content-type"] })
			);
			setBlobUrl(url);
			setFetching(false);
		};
		fetchImage();
	}, [imageUrl]);

	return (
		<div className={classes.imageWrapper}>
			<ModalImage
				className={classes.messageMedia}
				smallSrcSet={fetching ? imageUrl : blobUrl}
				medium={fetching ? imageUrl : blobUrl}
				large={fetching ? imageUrl : blobUrl}
				alt="image"
			/>
		</div>
	);
};

export default ModalImageCors;
