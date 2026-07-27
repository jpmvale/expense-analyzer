import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/pt-br';

const MonthPicker = ({
  value,
  onChange,
}: {
  value: Dayjs | null;
  onChange: (value: Dayjs | null) => void;
}) => {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pt-br">
      <DatePicker
        label="Fatura"
        views={['month', 'year']}
        value={value}
        onChange={onChange}
        disableFuture
        minDate={dayjs('2018-10-01')}
      />
    </LocalizationProvider>
  );
};

export default MonthPicker;
