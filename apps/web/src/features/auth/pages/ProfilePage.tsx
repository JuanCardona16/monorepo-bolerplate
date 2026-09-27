import { useProfile } from "../hooks";

export function ProfilePage() {
  const query = useProfile();

  if (query.isPending) {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4">
        <p className="text-muted" role="status">
          Loading profile…
        </p>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4">
        <p className="text-red-600" role="alert">
          Could not load profile.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center bg-sand p-4 sm:p-8">
      <section
        aria-labelledby="profile-title"
        className="w-full max-w-md rounded-3xl bg-paper p-8"
      >
        <h1 id="profile-title" className="mb-4 text-2xl font-bold text-ink">
          Your profile
        </h1>
        <dl>
          <div className="flex justify-between gap-4 border-t border-line py-3">
            <dt className="text-muted">Email</dt>
            <dd className="font-semibold text-ink">{query.data.email}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line py-3">
            <dt className="text-muted">Roles</dt>
            <dd className="font-semibold text-ink">{query.data.roles.join(", ")}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
