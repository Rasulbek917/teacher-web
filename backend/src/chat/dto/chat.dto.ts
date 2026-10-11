import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MessageType } from '@prisma/client';

export class SendMessageDto {
  @IsEnum(MessageType)
  type: MessageType;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;
}

export class EditMessageDto {
  @IsString()
  @MaxLength(4000)
  text: string;
}

export class StartDirectDto {
  @IsString()
  userId: string;
}

export class ChatMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString({}, { message: "Sana formati noto'g'ri" })
  before?: string;
}
