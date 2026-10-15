<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use the public site directory query for the overview and per-site routes; it keeps both screens synchronized after site mutations.
- Keep site mutations behind database-enforced admin roles in a separate user_roles table; new accounts remain viewers until explicitly assigned.
- Use one root AuthProvider for identity transitions and role reads; it prevents competing session subscriptions.
- Keep external records private and server-side; disconnected providers show explicit setup states, never synthetic live data.
