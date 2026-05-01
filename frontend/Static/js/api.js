// TMDB API helper
(function(window){
	const TMDB_BASE = 'https://api.themoviedb.org/3';
	const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

	function getKey(){
		return window.TMDB_API_KEY || '';
	}

	async function fetchTrendingMovies(){
		const key = getKey();
		if(!key) throw new Error('TMDB_API_KEY not set on window');
		const url = `${TMDB_BASE}/trending/movie/week?api_key=${key}`;
		const res = await fetch(url);
		if(!res.ok) throw new Error('TMDB fetch failed');
		const json = await res.json();
		return json.results || [];
	}

	function posterPath(path){
		return path ? IMAGE_BASE + path : '/static/images/placeholder.png';
	}

	window.AppAPI = window.AppAPI || {};
	window.AppAPI.fetchTrendingMovies = fetchTrendingMovies;
	window.AppAPI.posterPath = posterPath;
})(window);
