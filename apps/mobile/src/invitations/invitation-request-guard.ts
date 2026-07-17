export interface InvitationRequestGuard {
  begin(): () => boolean;
  invalidate(): void;
}

export function createInvitationRequestGuard(): InvitationRequestGuard {
  let generation = 0;

  return {
    begin() {
      generation += 1;
      const requestGeneration = generation;

      return () => generation === requestGeneration;
    },
    invalidate() {
      generation += 1;
    },
  };
}
