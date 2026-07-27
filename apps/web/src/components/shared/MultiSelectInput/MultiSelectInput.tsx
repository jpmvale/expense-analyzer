import { Theme, useTheme } from '@mui/material/styles';
import {
  Box,
  OutlinedInput,
  InputLabel,
  MenuItem,
  FormControl,
  Select,
  Chip,
} from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';

const ITEM_HEIGHT = 45;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

function getStyles(name: string, category: readonly string[], theme: Theme) {
  return {
    fontWeight:
      category.indexOf(name) === -1
        ? theme.typography.fontWeightRegular
        : theme.typography.fontWeightMedium,
  };
}

export default function MultipleSelectChip({
  name,
  items,
  category,
  setCategory,
}: {
  name: string;
  items: string[];
  category: string[];
  setCategory: (event: SelectChangeEvent<string[]>) => void;
}) {
  const theme = useTheme();

  return (
    <div>
      <FormControl sx={{ m: 1, width: '100%', maxWidth: 400 }}>
        <InputLabel id="demo-multiple-chip-label">{name}</InputLabel>
        <Select
          labelId="demo-multiple-chip-label"
          id="demo-multiple-chip"
          multiple
          value={category}
          onChange={setCategory}
          input={<OutlinedInput id="select-multiple-chip" label={name} />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((value) => (
                <Chip key={value} label={value} />
              ))}
            </Box>
          )}
          MenuProps={MenuProps}
          sx={{ minHeight: 40 }}
        >
          {items.map((item) => (
            <MenuItem
              key={item}
              value={item}
              style={getStyles(item, category, theme)}
            >
              {item}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  );
}
