// API helper — proxies TMDB via FastAPI and adds Supabase auth headers
(function(window){
	const API_BASE = 'http://localhost:8000/api';

	async function getAuthHeaders() {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) return {};
		return { Authorization: `Bearer ${session.access_token}` };
	}

	async function fetchTrendingMovies(){
		const res = await fetch(`${API_BASE}/movies/trending`);
		if(!res.ok) throw new Error('Trending fetch failed');
		return await res.json();
	}

	async function fetchMovieDetail(tmdbId){
		const res = await fetch(`${API_BASE}/movies/${tmdbId}`);
		if(!res.ok) throw new Error('Movie fetch failed');
		return await res.json();
	}

	async function generateRecommendations(preferences){
		const headers = await getAuthHeaders();
		const res = await fetch(`${API_BASE}/recommendations/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify({ preferences }),
		});
		if(!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw Object.assign(new Error(err.detail || 'Request failed'), { status: res.status });
		}
		return await res.json();
	}

	async function fetchRecommendationHistory(page = 1, limit = 10){
		const headers = await getAuthHeaders();
		const res = await fetch(`${API_BASE}/recommendations/history?page=${page}&limit=${limit}`, { headers });
		if(!res.ok) throw new Error('History fetch failed');
		return await res.json();
	}

	window.AppAPI = window.AppAPI || {};
	window.AppAPI.getAuthHeaders = getAuthHeaders;
	window.AppAPI.fetchTrendingMovies = fetchTrendingMovies;
	window.AppAPI.fetchMovieDetail = fetchMovieDetail;
	window.AppAPI.generateRecommendations = generateRecommendations;
	window.AppAPI.fetchRecommendationHistory = fetchRecommendationHistory;
})(window);
