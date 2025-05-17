import pandas as pd

def subset(csv_path, pct=0.3, subset_path='subset.csv'):
    df = pd.read_csv(csv_path, usecols=['start_station_id', 'end_station_id',
                                        'started_at', 'ended_at'])
    df.iloc[:int(pct * len(df))].to_csv(subset_path)

subset('/Users/cartertran/Downloads/202504-divvy-tripdata.csv', 0.35,
       'assets/divvy_subset.csv')
subset('/Users/cartertran/Downloads/bluebikes-traffic-2024-03.csv', 0.6,
       'assets/bluebike_subset.csv')
