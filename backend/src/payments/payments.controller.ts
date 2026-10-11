import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { MarkPaidDto, PaymentsQueryDto, UpdatePaymentDto } from './dto/payment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Roles(Role.TEACHER)
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaymentsQueryDto) {
    return this.payments.list(user.id, query);
  }

  @Post('mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Body() dto: MarkPaidDto) {
    return this.payments.markPaid(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.payments.update(user.id, id, dto);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.cancel(user.id, id);
  }
}

@Roles(Role.STUDENT)
@Controller('my/payments')
export class StudentPaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.payments.studentPayments(user.id);
  }
}
