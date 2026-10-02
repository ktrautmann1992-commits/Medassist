import { VerifizierungsFormular } from "./formular";

export default async function VerifizierenSeite({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <section className="stack">
      <h1>E-Mail-Adresse bestätigen</h1>
      <VerifizierungsFormular token={token} />
    </section>
  );
}
