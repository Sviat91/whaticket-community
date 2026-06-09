import React, { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';

import ModalImage from 'react-modal-image';
import api from '../../services/api';

const useStyles = makeStyles((theme) => ({
	imageContainer: {
		width: 250,
		aspectRatio: '1/1',
		overflow: 'hidden',
		borderRadius: 8,
		flexShrink: 0,
		backgroundColor: theme.palette.type === 'dark' ? '#2A373F' : '#D9D9D9',
	},
	imageWrapper: {
		width: '100%',
		height: '100%',
		'& > div': {
			width: '100%',
			height: '100%',
		},
		'& > div > img': {
			width: '100%',
			height: '100%',
			objectFit: 'cover',
			display: 'block',
		},
	},
}));

const ModalImageCors = ({ imageUrl }) => {
	const classes = useStyles();
	const [fetching, setFetching] = useState(true);
	const [blobUrl, setBlobUrl] = useState('');

	useEffect(() => {
		if (!imageUrl) return;
		const fetchImage = async () => {
			const { data, headers } = await api.get(imageUrl, {
				responseType: 'blob',
			});
			const url = window.URL.createObjectURL(
				new Blob([data], { type: headers['content-type'] })
			);
			setBlobUrl(url);
			setFetching(false);
		};
		fetchImage();
	}, [imageUrl]);

	return (
		<div className={classes.imageContainer}>
			<div className={classes.imageWrapper}>
				<ModalImage
					smallSrcSet={fetching ? imageUrl : blobUrl}
					medium={fetching ? imageUrl : blobUrl}
					large={fetching ? imageUrl : blobUrl}
					alt='image'
					imageBackgroundColor='transparent'
					hideDownload={false}
				/>
			</div>
		</div>
	);
};

export default ModalImageCors;
