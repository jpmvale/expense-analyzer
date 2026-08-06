import { extname } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportService } from './import.service';

/**
 * Quantos arquivos e de que tamanho, por requisição.
 *
 * Oito anos de fatura são 96 arquivos, então o teto precisa caber numa carga
 * histórica inteira de uma vez — importar em seis levas seria pior, porque a
 * memória de categorização só é compartilhada **dentro** de uma chamada. Cada
 * fatura real tem entre 5 e 60 KB; 2 MB por arquivo é folga larga e ainda impede
 * que alguém suba um vídeo pelo campo de CSV.
 */
const MAX_FILES = 120;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      // Em memória, sem `dest`: os arquivos são pequenos, são lidos uma vez e
      // descartados. Gravar em disco criaria lixo temporário no container que
      // ninguém limpa, e um caminho a mais por onde um CSV de alguém vazaria.
      limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
      fileFilter: (_req, file, callback) => {
        // Pela extensão, e não pelo mimetype: o navegador manda `text/csv`,
        // `application/vnd.ms-excel` ou `application/octet-stream` para o mesmo
        // arquivo, dependendo do sistema — recusar por mimetype rejeitaria
        // faturas boas em algumas máquinas e não em outras.
        if (extname(file.originalname).toLowerCase() !== '.csv') {
          return callback(new BadRequestException(`"${file.originalname}" não é um .csv.`), false);
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiOperation({
    summary:
      'Importa faturas em CSV — o mesmo pipeline do Drive, para quem não tem Drive. ' +
      'Reenviar um mês sobrescreve o que estava lá.',
  })
  @ApiResponse({ status: 409, description: 'Já existe uma sincronização em andamento' })
  importCsvs(
    @CurrentUser() userId: Types.ObjectId,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.importService.importCsvs(userId, files);
  }
}
