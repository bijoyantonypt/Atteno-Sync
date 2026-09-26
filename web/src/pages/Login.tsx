import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCsrfToken } from '../lib/csrf';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const csrfToken = await getCsrfToken();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          data: {
            csrf_token: csrfToken
          }
        }
      });

      if (error) throw error;

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
}

export default Login;
