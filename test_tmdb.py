import urllib.request, urllib.error, json, jwt, time

with open('.env', encoding='utf-8', errors='ignore') as f:
    env = {}
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip()

jwt_secret = env.get('SUPABASE_JWT_SECRET', '')

test_payload = {
    'sub': '123e4567-e89b-12d3-a456-426614174000',
    'email': 'test@example.com',
    'role': 'authenticated',
    'aud': 'authenticated',
    'email_confirmed_at': '2026-01-01T00:00:00Z',
    'iat': int(time.time()),
    'exp': int(time.time()) + 3600,
    'iss': 'supabase',
    'app_metadata': {'provider': 'email', 'providers': ['email']},
}
test_token = jwt.encode(test_payload, jwt_secret, algorithm='HS256')

payload_data = json.dumps({'preferences': {
    'genre': 'Action', 'mood': 'Thrilling', 'era': 'Recent',
    'language': 'English', 'watching_with': 'Solo'
}}).encode()

req = urllib.request.Request(
    'http://localhost:8000/api/recommendations/generate',
    data=payload_data,
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {test_token}'
    },
    method='POST'
)
try:
    print('Testing /api/recommendations/generate...')
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
        print('Status:', r.status)
        movies = data.get('movies', [])
        print('Returned movies count:', len(movies))
        for idx, m in enumerate(movies):
            poster = str(m.get('poster_url', ''))
            print(f"{idx+1}. {m.get('title')} - Poster: {poster}")
except urllib.error.HTTPError as e:
    body = json.loads(e.read().decode())
    print('Status:', e.code, body.get('detail'))
except Exception as e:
    print('Error:', e)
