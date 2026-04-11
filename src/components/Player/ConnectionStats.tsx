import React, {useState, useEffect} from 'react';

const ConnectionStats: React.FC<{optimisticCounter?: number}> = ({optimisticCounter}) => {
  const [connectionStatus, setConnectionStatus] = useState<
    | {
        connected: boolean;
        latency: number;
        timestamp: number;
      }
    | undefined
  >();
  useEffect(() => {
    const it = setInterval(() => {
      setConnectionStatus((window as any).connectionStatus);
    }, 2000);
    return () => {
      clearInterval(it);
    };
  }, []);

  let text: string;
  if (connectionStatus?.connected) {
    const syncLabel = optimisticCounter ? `${optimisticCounter} ahead` : 'Synced';
    text = `${syncLabel} (${connectionStatus.latency}ms)`;
  } else {
    text = 'Not connected';
  }

  return <div className="player--connection-stats">{text}</div>;
};

export default ConnectionStats;
