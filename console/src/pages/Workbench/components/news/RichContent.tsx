import styles from "./index.module.less";

export default function RichContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className={styles.richContent}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (/^\*\*(.+?)\*\*$/.test(trimmed)) {
          const title = trimmed.replace(/^\*\*|\*\*$/g, "");
          return (
            <h3 key={idx} className={styles.richHeading}>
              <span className={styles.richHeadingBar} />
              {title}
            </h3>
          );
        }

        if (/^[-\d]/.test(trimmed)) {
          const isOrdered = /^\d+\.\s/.test(trimmed);
          const text = trimmed.replace(/^[-\d]+\.\s*/, "");
          const parts = text.split(/(\*\*.+?\*\*)/g);
          return (
            <div key={idx} className={styles.richListItem}>
              <span
                className={`${styles.richBullet} ${
                  isOrdered ? styles.richBulletOrdered : ""
                }`}
              />
              <p className={styles.richParagraph}>
                {parts.map((part, pidx) => {
                  if (/^\*\*(.+?)\*\*$/.test(part)) {
                    return (
                      <strong key={pidx}>
                        {part.replace(/^\*\*|\*\*$/g, "")}
                      </strong>
                    );
                  }
                  return <span key={pidx}>{part}</span>;
                })}
              </p>
            </div>
          );
        }

        const parts = trimmed.split(/(\*\*.+?\*\*)/g);
        return (
          <p key={idx} className={styles.richParagraph}>
            {parts.map((part, pidx) => {
              if (/^\*\*(.+?)\*\*$/.test(part)) {
                return (
                  <strong key={pidx}>
                    {part.replace(/^\*\*|\*\*$/g, "")}
                  </strong>
                );
              }
              return <span key={pidx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
