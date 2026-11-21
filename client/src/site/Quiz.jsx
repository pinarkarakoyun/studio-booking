import { useState } from 'react';
import { whatsappLink } from './siteParts.js';
import styles from './PublicSite.module.css';

// "Sana hangi ders uygun?" testi. Cevaplar yalnızca bu bileşenin belleğinde durur: hiçbir yere kaydedilmez,
// gönderilmez, WhatsApp mesajına eklenmez (sorular sağlıkla ilgili olabilir, ör. hamilelik). Sunucu yalnızca ileri
// giden seçenekleri gönderdiği için test döngüye giremez ve her yol bir sonuçla biter.
const TRIAL_MESSAGE = 'Merhaba, deneme dersi hakkında bilgi almak istiyorum.';

export default function Quiz({ quiz, whatsappPhone }) {
  const [questionId, setQuestionId] = useState(quiz.questions[0].id);
  const [resultId, setResultId] = useState(null);
  const index = quiz.questions.findIndex((q) => q.id === questionId);
  const question = quiz.questions[index];
  const result = quiz.results.find((r) => r.id === resultId);
  const trial = whatsappLink(whatsappPhone, TRIAL_MESSAGE);

  function choose(option) {
    if (option.result) setResultId(option.result);
    else setQuestionId(option.next);
  }

  function restart() {
    setQuestionId(quiz.questions[0].id);
    setResultId(null);
  }

  return (
    <section id="test" className={styles.section} aria-labelledby="test-baslik">
      <div className={styles.quiz}>
        <div className={styles.quizIntro}>
          <p className={`${styles.script} ${styles.scriptOnDark}`}>Kısa bir test</p>
          <h2 id="test-baslik" className={styles.quizTitle}>
            {quiz.title ?? 'Sana hangi ders uygun?'}
          </h2>
          {quiz.intro && <p className={styles.quizLead}>{quiz.intro}</p>}
          <div className={styles.dots} aria-hidden="true">
            {quiz.questions.map((q, i) => (
              <span key={q.id} className={result || i <= index ? styles.dotOn : undefined} />
            ))}
          </div>
        </div>
        <div className={styles.quizCard} aria-live="polite">
          {result ? (
            <>
              <p className={styles.quizStep}>Sana önerimiz</p>
              <h3 className={styles.quizResult}>{result.title}</h3>
              <p className={styles.cardText}>{result.text}</p>
              <div className={styles.pills}>
                {trial && (
                  <a className={`${styles.pill} ${styles.pillPrimary}`} href={trial} target="_blank" rel="noreferrer">
                    Deneme dersi iste
                  </a>
                )}
                <button type="button" className={`${styles.pill} ${styles.pillOutline}`} onClick={restart}>
                  Baştan başla
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.quizStep}>
                Soru {index + 1} / {quiz.questions.length}
              </p>
              <h3 className={styles.quizQuestion}>{question.text}</h3>
              <div className={styles.quizOptions}>
                {question.options.map((option) => (
                  <button key={option.label} type="button" className={styles.quizOption} onClick={() => choose(option)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
