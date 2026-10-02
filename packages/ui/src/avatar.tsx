export interface AvatarProps {
  initialen: string;
  /** Kinderprofile werden blau gekennzeichnet (CLAUDE.md §13). */
  kind?: boolean;
}

export function Avatar({ initialen, kind = false }: AvatarProps) {
  return (
    <span className={kind ? "avatar child" : "avatar"} aria-hidden="true">
      {initialen}
    </span>
  );
}
