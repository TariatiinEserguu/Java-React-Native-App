import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ScreenHeader, Segmented, screen } from '../../components/ui';
import { DATABASE_NAME } from '../../db/schema';
import { useI18n } from '../../i18n';
import { makeStyles } from '../../theme';
import { SqlEditor } from './SqlEditor';
import { TableBrowser } from './TableBrowser';

type Mode = 'editor' | 'browser';

export function DatabaseScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const [mode, setMode] = useState<Mode>('editor');
  const [sql, setSql] = useState('SELECT * FROM v_medicine_stock ORDER BY brand_name;');

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={t('sql.title')} subtitle={`SQLite · ${DATABASE_NAME}`} />
      <Segmented
        options={[
          ['editor', t('sql.tab.editor')],
          ['browser', t('sql.tab.browser')],
        ]}
        value={mode}
        onChange={setMode}
      />
      {/* Both stay mounted so editor results survive switching. */}
      <View style={mode === 'editor' ? null : styles.hidden}>
        <SqlEditor sql={sql} onChangeSql={setSql} />
      </View>
      <View style={mode === 'browser' ? null : styles.hidden}>
        <TableBrowser
          onOpenInEditor={(query) => {
            setSql(query);
            setMode('editor');
          }}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  hidden: { display: 'none' },
}));
