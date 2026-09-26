import Link from 'next/link';

export function SchoolDayReopeningPanel({ schoolId }: { schoolId: string }) {
  return (
    <section className="nf-panel">
      <div className="nf-panel-body flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="nf-panel-title">Денні меню</h2>
          <p className="nf-description">
            Календар меню школи та виправлення даних поточного місяця.
          </p>
        </div>
        <Link
          className="nf-button nf-button-secondary"
          href={`/admin/daily-menus?school_id=${encodeURIComponent(schoolId)}`}
        >
          Відкрити календар
        </Link>
      </div>
    </section>
  );
}
