import { useProfile } from "../hooks";

export function ProfilePage() {
  const query = useProfile();

  if (query.isPending) {
    return <p>Loading profile…</p>;
  }
  if (query.isError) {
    return <p className="error">Could not load profile.</p>;
  }
  return (
    <div>
      <h1>Profile</h1>
      <p>Email: {query.data.email}</p>
      <p>Roles: {query.data.roles.join(", ")}</p>
    </div>
  );
}
