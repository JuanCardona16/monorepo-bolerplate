import { useQuery } from "@tanstack/react-query";
import { api } from "../../app/api.js";
import { useAuthStore } from "../../stores/auth.js";

interface Profile {
  uuid: string;
  email: string;
  roles: string[];
}

export function ProfilePage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<Profile>("/api/v1/auth/me"),
    enabled: accessToken !== null,
  });

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
