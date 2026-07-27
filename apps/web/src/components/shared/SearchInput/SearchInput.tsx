import { TextField } from '@mui/material';
import type { ChangeEvent } from 'react';

const SearchInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) => {
  return (
    <TextField
      id="outlined-basic"
      label="Título"
      variant="outlined"
      value={value}
      onChange={onChange}
    />
  );
};
export default SearchInput;
