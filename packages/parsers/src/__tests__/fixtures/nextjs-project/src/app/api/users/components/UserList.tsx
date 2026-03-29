// A component that calls the API
'use client';

import { useEffect, useState } from 'react';

export default function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data.users));
  }, []);

  return <ul>{users.map((u: any) => <li key={u.id}>{u.name}</li>)}</ul>;
}
