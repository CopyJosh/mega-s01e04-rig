import type { NightDigest } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>warnings</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const warnings = [
                ...(row.retries >= 3 ? ['3 or more retries'] : []),
                ...(row.hasFailure ? ['failed'] : []),
              ];

              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td class={warnings.length > 0 ? 'warn' : 'mute'}>
                    {warnings.length > 0 ? warnings.join(', ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 && (
        <p class="warn">{digest.badLines} invalid {digest.badLines === 1 ? 'line' : 'lines'} ignored</p>
      )}
    </>
  );
}
