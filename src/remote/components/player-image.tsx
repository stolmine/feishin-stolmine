import styles from './player-image.module.css';

import { useSend } from '/@/remote/store';

interface PlayerImageProps {
    src?: null | string;
}

export const PlayerImage = ({ src }: PlayerImageProps) => {
    const send = useSend();

    return (
        <div className={styles.frame}>
            {src ? (
                <img
                    alt=""
                    className={styles.image}
                    onError={() => send({ event: 'proxy' })}
                    src={src.replaceAll(/&(size|width|height)=\d+/g, '')}
                />
            ) : (
                <svg
                    aria-hidden="true"
                    className={styles.placeholder}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path d="M12 3v10.55a4 4 0 1 0 2 3.45V7h4V3h-6z" />
                </svg>
            )}
        </div>
    );
};
