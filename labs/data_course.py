"""Execute the data course's fixed operations on the station readings."""

from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys

import numpy as np
import pandas as pd


FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'station-readings.json'
READING_COLUMNS = ('id', 'day', 'zone', 'reading')
TABLE_COLUMNS = {
    'all': READING_COLUMNS,
    'day-zone': ('day', 'zone'),
    'zone-reading': ('zone', 'reading'),
}
QUERY_COLUMNS = {
    'all': READING_COLUMNS,
    'zone-reading': ('zone', 'reading'),
    'id-reading': ('id', 'reading'),
}
SQL_AGGREGATES = {'count': 'COUNT', 'mean': 'AVG', 'min': 'MIN', 'max': 'MAX', 'sum': 'SUM'}
NUMPY_STATS = {'mean': np.mean, 'median': np.median, 'range': np.ptp, 'min': np.min, 'max': np.max}
NUMPY = f'NumPy {np.__version__}'
PANDAS = f'pandas {pd.__version__}'
SQLITE = f'SQLite {sqlite3.sqlite_version}'


def data_table(frame):
    cells = frame.astype(object).where(frame.notna(), None)
    return {'columns': frame.columns.tolist(), 'rows': cells.to_numpy().tolist()}


def project_array(frame, params):
    column, start, stop = params['column'], params['start'], params['stop']
    values = np.asarray(frame[column])
    part = slice(start, stop)
    output = pd.DataFrame({'index': np.arange(values.size)[part], column: values[part]})
    code = f'values = np.asarray(frame[{column!r}])\nindices = np.arange(values.size)[{start}:{stop}]\nselected = values[{start}:{stop}]'
    return output, NUMPY, code


def mask_readings(frame, params):
    column, comparison, threshold = params['column'], params['comparison'], params['threshold']
    values = pd.to_numeric(frame[column], errors='coerce').to_numpy()
    comparator, symbol = (np.greater_equal, '>=') if comparison == 'gte' else (np.less_equal, '<=')
    keep = comparator(values, threshold)
    code = f"values = pd.to_numeric(frame[{column!r}], errors='coerce').to_numpy()\nkeep = values {symbol} {threshold}\nselected = frame.loc[keep]"
    return frame.loc[keep], NUMPY, code


def project_table(frame, params):
    columns, zone = list(TABLE_COLUMNS[params['columns']]), params['zone']
    included = frame if zone == 'all' else frame.loc[frame['zone'] == zone]
    code = 'selected = frame' if zone == 'all' else f"selected = frame.loc[frame['zone'] == {zone!r}]"
    return included.loc[:, columns], PANDAS, code + f'\nselected = selected.loc[:, {columns!r}]'


def clean_readings(frame, params):
    cleaned = frame.copy()
    cleaned['reading'] = pd.to_numeric(cleaned['reading'], errors='coerce')
    code = ['cleaned = frame.copy()', "cleaned['reading'] = pd.to_numeric(cleaned['reading'], errors='coerce')"]
    if params['trim']:
        cleaned['zone'] = cleaned['zone'].str.strip().str.lower()
        code.append("cleaned['zone'] = cleaned['zone'].str.strip().str.lower()")
    if params['dropMissing']:
        cleaned = cleaned.dropna(subset=['reading'])
        code.append("cleaned = cleaned.dropna(subset=['reading'])")
    if params['deduplicate']:
        cleaned = cleaned.drop_duplicates(subset=['id'], keep='first')
        code.append("cleaned = cleaned.drop_duplicates(subset=['id'], keep='first')")
    return cleaned, PANDAS, '\n'.join(code)


def summarize_readings(frame, params):
    statistic, zone = params['statistic'], params['zone']
    included = frame if zone == 'all' else frame.loc[frame['zone'] == zone]
    values = pd.to_numeric(included['reading'], errors='coerce').dropna().to_numpy()
    code = 'selected = frame' if zone == 'all' else f"selected = frame.loc[frame['zone'] == {zone!r}]"
    code += "\nvalues = pd.to_numeric(selected['reading'], errors='coerce').dropna().to_numpy()"
    if statistic == 'count':
        value = int(values.size)
        code += '\nresult = values.size'
    else:
        calculate = NUMPY_STATS[statistic]
        value = round(float(calculate(values)), 2) if values.size else None
        code += f'\nresult = round(float(np.{calculate.__name__}(values)), 2) if values.size else None'
    return pd.DataFrame([(statistic, value)], columns=['statistic', 'value']), NUMPY, code


def group_readings(frame, params):
    key, statistic = params['by'], params['statistic']
    selected = frame.assign(reading=pd.to_numeric(frame['reading'], errors='coerce'))
    aggregated = selected.groupby(key, sort=True)['reading'].agg(statistic)
    output = aggregated.round(2).reset_index(name=statistic)
    code = "selected = frame.assign(reading=pd.to_numeric(frame['reading'], errors='coerce'))"
    code += f"\ngroups = selected.groupby({key!r}, sort=True)['reading']\nresult = groups.agg({statistic!r}).round(2).reset_index(name={statistic!r})"
    return output, PANDAS, code


def execute_sql(frame, table, query, parameters):
    with closing(sqlite3.connect(':memory:')) as connection:
        frame.to_sql(table, connection, index=False)
        cursor = connection.execute(query, parameters)
        columns = [field[0] for field in cursor.description]
        output = pd.DataFrame(cursor.fetchall(), columns=columns)
    code = f"-- Parameters: {json.dumps(parameters)}\n{query}"
    return output, SQLITE, code


def query_readings(frame, params):
    columns = ', '.join(QUERY_COLUMNS[params['columns']])
    minimum, zone, sort = params['minimum'], params['zone'], params['sort']
    sort_columns = {'id': 'id ASC', 'reading-asc': 'reading ASC, id ASC', 'reading-desc': 'reading DESC, id ASC'}
    query = f'SELECT {columns}\nFROM readings\nWHERE reading >= ?'
    parameters = [minimum]
    if zone != 'all':
        query += ' AND zone = ?'
        parameters.append(zone)
    query += f'\nORDER BY {sort_columns[sort]};'
    readings = frame.assign(reading=pd.to_numeric(frame['reading'], errors='coerce'))
    return execute_sql(readings, 'readings', query, parameters)


def grouped_order(key, statistic, sort):
    return {
        'key': f'{key} ASC',
        'value-asc': f'{statistic} ASC, {key} ASC',
        'value-desc': f'{statistic} DESC, {key} ASC',
    }[sort]


def query_groups(frame, params):
    key, statistic = params['by'], params['statistic']
    aggregate = f'{SQL_AGGREGATES[statistic]}(reading)'
    order = grouped_order(key, statistic, params['sort'])
    query = f'''SELECT {key}, ROUND({aggregate}, 2) AS {statistic}
FROM readings
GROUP BY {key}
HAVING {aggregate} >= ?
ORDER BY {order};'''
    readings = frame.assign(reading=pd.to_numeric(frame['reading'], errors='coerce'))
    return execute_sql(readings, 'readings', query, [params['minimum']])


def query_report(frame, params):
    key, statistic = frame.columns
    if key not in ('zone', 'day') or statistic not in SQL_AGGREGATES:
        raise ValueError('A report needs grouped readings')
    order = grouped_order(key, statistic, params['sort'])
    query = f'''SELECT {key}, {statistic}
FROM grouped_readings
WHERE {statistic} >= ?
ORDER BY {order};'''
    return execute_sql(frame, 'grouped_readings', query, [params['minimum']])


OPERATIONS = {
    'array': project_array, 'mask': mask_readings, 'table': project_table, 'clean': clean_readings,
    'summary': summarize_readings, 'group': group_readings, 'query': query_readings,
    'sql-group': query_groups, 'report': query_report,
}


def run_course(request, tables):
    output = None
    steps = []
    for step in request['steps']:
        frame = output if step['input'] == 'previous' else tables[step['input']]
        if frame is None:
            raise ValueError('This step needs the preceding result')
        output, engine, code = OPERATIONS[step['operation']](frame, step['params'])
        steps.append({'input': data_table(frame), 'output': data_table(output), 'engine': engine, 'code': code})
    return {'steps': steps}


def try_course(request, tables):
    try:
        return run_course(request, tables)
    except (KeyError, TypeError, ValueError, sqlite3.DatabaseError):
        return None


def main():
    fixture = json.loads(FIXTURE.read_text(encoding='utf-8'))
    raw = pd.DataFrame(fixture['rows'], columns=fixture['columns'])
    clean, _, _ = clean_readings(raw, {'trim': True, 'dropMissing': True, 'deduplicate': True})
    tables = {'raw': raw, 'clean': clean}
    if sys.argv[1:] == ['--batch']:
        requests = json.loads(sys.stdin.buffer.read(128 * 1024))
        result = [try_course(request, tables) for request in requests]
    else:
        result = run_course(json.loads(sys.stdin.buffer.read(2048)), tables)
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
