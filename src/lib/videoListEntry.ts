// The array shape every paginated video list route returns: /api/videos,
// /api/search, /api/channel and /api/pins. Kept in one place so a field
// change cannot land in some routes and not others.
export type VideoListEntry = {
	id: string;
	thumbnail: string;
	channel: string;
	channelAvatar: string;
	channelName: string;
	title: string;
};
