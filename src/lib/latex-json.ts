/**
 * Models often write LaTeX into JSON with a single backslash ("$\infty$").
 * JSON reads "\t", "\f", "\b", "\n" and "\r" as control characters, so
 * "\theta" becomes a tab and "heta", and jsonrepair drops the backslash of
 * any other escape, so "\infty" becomes "infty" and renders as italic letters.
 */

/** Commands the thumbnail renderer accepts inside $math$. */
export const LATEX_COMMANDS = new Set(
  (
    "frac dfrac tfrac sqrt int iint oint sum prod lim infty partial nabla cdot cdots ldots " +
    "times div pm mp mid le leq ge geq ne neq approx equiv sim simeq propto to rightarrow leftarrow " +
    "Rightarrow iff mapsto in notin subset subseteq cup cap forall exists emptyset vec hat bar dot " +
    "ddot tilde overline mathbf mathbb mathrm mathcal operatorname text left right big Big langle " +
    "rangle lfloor rfloor lceil rceil sin cos tan log ln exp det max min hl quad qquad imath jmath " +
    "ell hbar prime circ degree angle triangle perp parallel binom alpha beta gamma Gamma delta " +
    "Delta epsilon varepsilon zeta eta theta Theta vartheta iota kappa lambda Lambda mu nu xi Xi " +
    "pi Pi rho sigma Sigma tau upsilon phi Phi varphi chi psi Psi omega Omega"
  ).split(" "),
);

/** Further commands a scene plan's formulas use whose names start like a JSON escape. */
const ESCAPE_LIKE_COMMANDS = new Set(
  (
    "bf boldsymbol bmatrix begin bigg Bigg bigl bigr bot bullet frown bigcup bigcap " +
    "neg ni nmid nleq ngeq nsubseteq ntriangleleft nearrow nwarrow newline " +
    "rm rbrace rvert rVert rtimes rightleftharpoons rightharpoonup " +
    "tanh textbf textit textrm texttt textsf tiny top therefore triangleq " +
    "underbrace underline uparrow Uparrow updownarrow uplus"
  ).split(" "),
);

function isLatexCommand(name: string): boolean {
  return LATEX_COMMANDS.has(name) || ESCAPE_LIKE_COMMANDS.has(name);
}

/**
 * Double the lone backslash before a LaTeX command in raw JSON text, so the
 * parsed string keeps "\infty" and "\theta". A backslash before letters that
 * are not a valid JSON escape is always doubled (JSON would reject it and
 * jsonrepair would drop it); one before b, f, n, r, t or u is doubled only
 * when the letters name a known command, so real "\n" escapes survive.
 */
export function protectLatexBackslashes(raw: string): string {
  return raw.replace(
    /(\\+)([A-Za-z]+)/g,
    (match, slashes: string, letters: string) => {
      if (slashes.length % 2 === 0) return match;
      const escapeLike = /^[bfnrtu]/.test(letters);
      return !escapeLike || isLatexCommand(letters)
        ? `${slashes}\\${letters}`
        : match;
    },
  );
}
