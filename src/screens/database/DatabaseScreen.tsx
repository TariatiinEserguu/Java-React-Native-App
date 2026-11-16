import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ScreenHeader, Segmented, screen } from '../../components/ui';
import { ScreenActivity } from '../../db/DataContext';
import { DATABASE_NAME } from '../../db/schema';
import { useI18n } from '../../i18n';
import { makeStyles } from '../../theme';
import { DatabaseOverview } from './DatabaseOverview';
import { SqlEditor } from './SqlEditor';
import { TableBrowser } from './TableBrowser';

type Mode = 'overview' | 'editor' | 'browser';

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
          ['overview', t('sql.tab.overview')],
          ['editor', t('sql.tab.editor')],
          ['browser', t('sql.tab.browser')],
        ]}
        value={mode}
        onChange={setMode}
      />
      {/* All stay mounted so editor results survive switching; hidden ones don't refresh until shown. */}
      <View style={mode === 'overview' ? null : styles.hidden}>
        <ScreenActivity active={mode === 'overview'}>
          <DatabaseOverview />
        </ScreenActivity>
      </View>
      <View style={mode === 'editor' ? null : styles.hidden}>
        <ScreenActivity active={mode === 'editor'}>
          <SqlEditor sql={sql} onChangeSql={setSql} />
        </ScreenActivity>
      </View>
      <View style={mode === 'browser' ? null : styles.hidden}>
        <ScreenActivity active={mode === 'browser'}>
          <TableBrowser
            onOpenInEditor={(query) => {
              setSql(query);
              setMode('editor');
            }}
          />
        </ScreenActivity>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  hidden: { display: 'none' },
}));
