import { useProfile } from "../hooks";

export function ProfilePage() {
  const query = useProfile();

  if (query.isPending) {
    return (
      <div className="page">
        <p className="status" role="status">
          Loading profile…
        </p>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="page">
        <p className="form-error" role="alert">
          Could not load profile.
        </p>
      </div>
    );
  }
  return (
    <div className="page">
      <section className="profile-card" aria-labelledby="profile-title">
        <h1 id="profile-title">Your profile</h1>
        <dl>
          <div className="profile-row">
            <dt>Email</dt>
            <dd>{query.data.email}</dd>
          </div>
          <div className="profile-row">
            <dt>Roles</dt>
            <dd>{query.data.roles.join(", ")}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
